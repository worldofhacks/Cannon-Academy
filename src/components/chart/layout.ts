/**
 * The chart's two rules for turning `board.ts` numbers into pixels, and nothing else.
 *
 * ## Geometry
 *
 * `board.ts` states it: a board coordinate maps PROPORTIONALLY (`x / boardWidth`, `y / boardHeight`)
 * against the letterboxed frame from `containWorldBoard`, while a SIZE scales by that same uniform
 * scale. The outer map box may be wider on tablet/desktop; the composition stays board-faithful.
 *
 * The two are deliberately different multipliers. Scaling positions by `art` would let the map
 * overflow a narrow screen; scaling sizes proportionally would squash every island on a tall one.
 *
 * A `MapFrame` carries its own board size, because the two views are drawn at two different board
 * heights — 555 on the voyage map, 513 on the close chart — and a single shared constant would put
 * every close-chart node 8% too low.
 *
 * ## State
 *
 * Which of the five states a station renders is NOT decided here. `services/chart.ts` owns fog and
 * order and has frozen tests; this file reads its answer and pairs it with the board's own
 * per-position drawing (`Station.silhouette` — the far end of the map, which only ever matters
 * while a station is fogged).
 *
 * ## Why the close chart's vertical geometry lives here and not in the component
 *
 * Because it has to be provable. The board draws exactly one arrangement of that screen and the app
 * has to draw five, and the one the board drew has its live node's label stack ending 8pt BELOW the
 * fog band's own node — surviving only by missing it sideways. A component can render that; only a
 * pure function can be asserted to never do it again, at every focus position and every scale. So
 * `closeChartSlots` and `closeChartColumns` are the model, `CloseChart.tsx` is the renderer, and
 * `design-fidelity.test.ts` holds the model to the no-intersection rule.
 */
import { CLOSE, CLOSE_NODE, FOG_BAND, type Station } from './board';
import type { ChartNode } from '../../services/chart';

/** The live map box, the board it is drawn from, and the art scale everything inside it uses. */
export interface MapFrame {
  /** Pixel size of the letterboxed board on screen. */
  readonly width: number;
  readonly height: number;
  /** The board's own size, in design points — `VOYAGE.map` or `CLOSE.map`. */
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly art: number;
}

/** A board x, proportionally. */
export function mapX(f: MapFrame, x: number): number {
  return (x / f.boardWidth) * f.width;
}

/** A board y, proportionally. */
export function mapY(f: MapFrame, y: number): number {
  return (y / f.boardHeight) * f.height;
}

/** A board coordinate given as `right:` — the board authors three of them that way. */
export function mapRight(f: MapFrame, right: number): number {
  return f.width - mapX(f, right);
}

/** A drawn size, by the art scale. */
export function art(f: MapFrame, designPx: number): number {
  return designPx * f.art;
}

/**
 * How far the contain-fitted composition sits inside the measured map box.
 *
 * `x` is the gutter on EACH side (the board is centred horizontally); `y` is the whole gap above it
 * (the board is anchored to the bottom, because the fog band has to meet the dock).
 */
export interface BoardSlack {
  readonly x: number;
  readonly y: number;
}

/**
 * A board position for something that belongs to the SCREEN EDGE rather than to the composition.
 *
 * The counter chip, the compass rose, the close chart's compass button and the fog band's own bleed
 * are all chrome: the board pins them to the edges of a 375×667 frame, which is a statement about
 * the device, not about where the islands are. At any other aspect the contain-fitted composition
 * has gutters, and chrome that rode with it would float a gutter's worth into open water — a
 * compass 92pt in from the corner of a tablet reads as a mistake.
 *
 * Undoing the slack puts it back against the box. Nothing that belongs to the SEA — an island, a
 * waypoint, the ship — may use these: those keep the composition, which is the whole point of
 * letterboxing it.
 */
export function chromeY(f: MapFrame, y: number, slack: BoardSlack): number {
  return mapY(f, y) - slack.y;
}

/** The same, for a left or right inset. */
export function chromeInsetX(f: MapFrame, inset: number, slack: BoardSlack): number {
  return mapX(f, inset) - slack.x;
}

/** The five progress states a child can encounter on the chart. */
export type StationState = 'current' | 'available' | 'cleared' | 'locked-near' | 'far-silhouette';

export interface StationPresentation {
  readonly accessibilityLabel: string;
  readonly markerHead: 'live' | 'available' | 'cleared' | 'locked' | 'silhouette';
  readonly tappable: boolean;
}

/**
 * Where the ship parks, and which node gets the ring.
 *
 * The captain's own island when they have one. Otherwise the furthest island the fog has already
 * lifted from, because that is the one they are being sent to next — a chart with no live target is
 * a chart with nothing to do. Falls back to the first station so a captain who has not been placed
 * yet still gets a whole screen rather than a hole where the ship goes.
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
 * The renderer and the accessibility tree consume the same state description, so a visual tick can
 * never drift away from what VoiceOver announces or which markers accept a press.
 *
 * `locked` and `silhouette` draw identically on the rebuilt board — every locked island gets the
 * same slate disc, glyph and name, because 9a's whole argument is that *"a child can want it before
 * they can reach it"*. They stay distinct HERE because what a screen reader says about them is
 * different, and because the distinction is the one the frozen presentation test pins.
 */
export function stationPresentation(
  node: ChartNode,
  state: StationState,
  requirement: string | null,
): StationPresentation {
  const label = node.displayName;

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
 * The hit slop that grows a drawn silhouette into the board's 64pt target.
 *
 * Board 9b: *"Every node carries a transparent 64×64 hit area around its drawn disc — the disc is
 * the picture, the column is the target."* The close chart draws that wrapper; the voyage map omits
 * it, and it is supplied for every tappable node on both (owner ruling 7). `hitSlop` rather than a
 * padded wrapper on purpose: a wrapper would widen the flex column and shift the picture, and the
 * whole point is that the two are sized independently.
 */
export function targetSlop(drawnW: number, drawnH: number, target: number) {
  return {
    left: Math.max(0, (target - drawnW) / 2),
    right: Math.max(0, (target - drawnW) / 2),
    top: Math.max(0, (target - drawnH) / 2),
    bottom: Math.max(0, (target - drawnH) / 2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The close chart's three slots
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Which island goes in each of the close chart's three slots.
 *
 * The board draws the island BEHIND the captain (cleared, top-left), the one they are ON (live,
 * right) and one under the fog band. The app generalises that to any focus: `behind` is the
 * previous island in catalog order, `here` is the focus, and `ahead` is the NEAREST island the fog
 * has not lifted from — not simply `focus + 1`, because the band is the promise that there is more
 * and an already-open island in it would fog a place the captain can sail to.
 *
 * A slot with no island does not draw. The sea and the weather are still there, which is the honest
 * picture of an ocean that continues.
 */
export interface CloseSlots {
  readonly behind: number | undefined;
  readonly here: number | undefined;
  readonly ahead: number | undefined;
}

export function closeChartSlots(nodes: readonly ChartNode[], live: number): CloseSlots {
  const ahead = nodes.findIndex((node, i) => i > live && node.fogged);
  return {
    behind: nodes[live - 1] === undefined ? undefined : live - 1,
    here: nodes[live] === undefined ? undefined : live,
    ahead: ahead < 0 ? undefined : ahead,
  };
}

/** A node column: where its top sits, and how tall the whole head-plus-chips stack is. Pixels. */
export interface NodeColumn {
  readonly top: number;
  readonly height: number;
}

export interface CloseColumns {
  /** The fog band's drawn height — the board's own, unless its node needs more. */
  readonly fogBandHeight: number;
  /** Top of the fog band's own node group, in map pixels. */
  readonly fogGroupTop: number;
  readonly cleared: NodeColumn;
  readonly live: NodeColumn;
  readonly ahead: NodeColumn;
  /**
   * The ship's top, in map pixels.
   *
   * It rides with the live node rather than sitting at its own board y. The board berths the ship
   * against that node — hull at y 238, node at 310 — and if the node yields to the fog band while
   * the ship does not, the gold disc slides down over the boat. Moving both by the same amount is
   * what keeps the arrangement the board actually drew.
   */
  readonly shipTop: number;
}

/**
 * A chip's drawn height: the board's padding either side of a line, plus its plank shadow.
 *
 * Chips hug text, so they follow TYPE while the head above them follows ART — which is exactly the
 * divergence that makes this arithmetic worth doing rather than eyeballing. `1.3` is the line
 * height every chip on this screen is rendered with.
 */
function chipHeight(size: number, padY: number, shadowDy: number, typeScale: number): number {
  return (padY * 2 + size * 1.3 + shadowDy) * typeScale;
}

/**
 * Where the close chart's node columns go.
 *
 * Each column starts at the board's own y, then is pulled UP if its label stack would otherwise
 * reach the fog band's node — see `CLOSE_NODE.fogClearance` for why the separation has to be
 * vertical. The clamp is a `min`, so on a composition with room it is the board's number unchanged;
 * it bites only where the board's own arrangement does not fit the strings or the scale in front of
 * it, and it bites by exactly as much as it must.
 *
 * The fog group is never clamped: it is the thing everything else yields to, because a locked
 * island's requirement chip is the only copy on the screen telling a child what to do next.
 */
export function closeChartColumns(frame: MapFrame, typeScale: number): CloseColumns {
  const gap = art(frame, CLOSE_NODE.gap);
  const nameChip = chipHeight(CLOSE_NODE.chip.size, CLOSE_NODE.chip.padY, 0, typeScale);
  const parchmentChip = chipHeight(
    CLOSE_NODE.chip.size,
    CLOSE_NODE.chip.padY,
    CLOSE_NODE.chip.shadowDy,
    typeScale,
  );
  const liveChip = chipHeight(CLOSE_NODE.liveChip.size, CLOSE_NODE.liveChip.padY, 0, typeScale);
  const subChip = chipHeight(CLOSE_NODE.sub.size, CLOSE_NODE.sub.padY, 0, typeScale);
  const smallChip = chipHeight(CLOSE_NODE.smallChip.size, CLOSE_NODE.smallChip.padY, 0, typeScale);

  const clearedHeight = art(frame, CLOSE_NODE.cleared.size) + gap + parchmentChip;
  const liveHeight = art(frame, CLOSE_NODE.live.ring) + gap + liveChip + gap + subChip;
  const aheadHeight = art(frame, CLOSE_NODE.locked.size) + gap + nameChip + gap + smallChip;

  /*
   * The band is the board's measured 108, and only grows if its own node genuinely will not fit.
   *
   * At the reference frame it never does: the group is 96.5 under an 8pt inset, so the board's
   * number holds with room spare. It grows only where ART and TYPE pull apart — a short viewport
   * contain-fits the composition well under 1 while chips stay near it, so the group swells against
   * a band that shrank. Growing is the sanctioned fix (owner ruling 10); doing it unconditionally
   * was not, because a taller band starts higher up the screen, and that is exactly the headroom
   * the live island's label stack lives in.
   */
  const bandFloor = art(frame, FOG_BAND.group.top) + aheadHeight;
  const fogBandHeight = Math.max(art(frame, FOG_BAND.height), bandFloor);
  // Bottom-anchored, so the group's top is measured back from the map's own bottom.
  const fogGroupTop = frame.height - fogBandHeight + art(frame, FOG_BAND.group.top);
  const ceiling = fogGroupTop - art(frame, CLOSE_NODE.fogClearance);

  const seat = (boardY: number, height: number): NodeColumn => ({
    top: Math.min(mapY(frame, boardY), ceiling - height),
    height,
  });

  const live = seat(CLOSE.nodeLive.y, liveHeight);
  const lift = mapY(frame, CLOSE.nodeLive.y) - live.top;

  return {
    fogBandHeight,
    fogGroupTop,
    cleared: seat(CLOSE.nodeCleared.y, clearedHeight),
    live,
    ahead: { top: fogGroupTop, height: aheadHeight },
    shipTop: mapY(frame, CLOSE.ship.y) - lift,
  };
}
