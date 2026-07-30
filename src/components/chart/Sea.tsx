/**
 * The sea the chart is drawn on: grid paper, and the one dashed route the board draws.
 *
 * The grid is `repeating-linear-gradient` in the board — 2pt white lines on a 30pt pitch, both
 * axes, over `#B9E2F5`. React Native has no repeating gradient, so it is drawn as rects in a
 * single `<Svg>`: one draw call rather than thirty Views, and the pitch scales with the art
 * because the paper is part of the picture.
 *
 * The route is a decorative fragment, not a connector — `board.ts` says why, and drawing it as a
 * connector between two node centres would be redrawing the design rather than rendering it.
 */
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { GRID, ROUTE } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const DEG = Math.PI / 180;

export function Sea({ frame }: { frame: MapFrame }) {
  const pitch = art(frame, GRID.pitch);
  const line = art(frame, GRID.line);
  const columns = Math.ceil(frame.width / pitch) + 1;
  const rows = Math.ceil(frame.height / pitch) + 1;

  return (
    <Svg width={frame.width} height={frame.height} style={FILL} pointerEvents="none">
      {Array.from({ length: columns }, (_, i) => (
        <Rect key={`c${i}`} x={i * pitch} y={0} width={line} height={frame.height} fill={chart.gridLine} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Rect key={`r${i}`} x={0} y={i * pitch} width={frame.width} height={line} fill={chart.gridLine} />
      ))}
    </Svg>
  );
}

/**
 * The dashed fragment, at the board's own place and angle.
 *
 * The board rotates it about `transform-origin: 0 50%` — its left edge, not its centre, which is
 * React Native's only origin. Rather than depend on `transformOrigin` (and on every renderer
 * agreeing about it), the same result is produced by placing the bar where a centre-rotation ends
 * up pinning that left edge: rotating a bar of length `len` about its centre moves its left edge by
 * `(len/2)(cosθ − 1, sinθ)`, so the layout position is shifted by exactly that much in reverse.
 */
export function Route({ frame }: { frame: MapFrame }) {
  const len = art(frame, ROUTE.length);
  const thickness = art(frame, ROUTE.thickness);
  const dash = art(frame, ROUTE.dash);
  const half = len / 2;
  const theta = ROUTE.angle * DEG;

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: mapX(frame, ROUTE.x) + half * (Math.cos(theta) - 1),
        top: mapY(frame, ROUTE.y) + half * Math.sin(theta),
        width: len,
        height: thickness,
        opacity: ROUTE.opacity,
        overflow: 'hidden',
        flexDirection: 'row',
        transform: [{ rotate: `${ROUTE.angle}deg` }],
      }}
    >
      {Array.from({ length: Math.ceil(len / (dash * 2)) }, (_, i) => (
        <View
          key={i}
          style={{ width: dash, height: thickness, marginRight: dash, backgroundColor: chart.ink }}
        />
      ))}
    </View>
  );
}
