/**
 * A CSS `clip-path: polygon(...)` shape, rendered exactly.
 *
 * This is the single primitive that makes the design transcribable rather than approximable.
 * Every sail, hull, pennant, badge and burst in the boards is a `clip-path` polygon with
 * percentage coordinates; React Native has no `clip-path`, and the nearest primitives — a
 * border-trapezoid, a rounded rect — are why the first pass drifted.
 *
 * `points` takes the design's own percentages in the same order, so
 *
 *   clip-path: polygon(100% 0, 100% 100%, 0 88%, 0 12%)
 *
 * becomes
 *
 *   <Poly points="100,0 100,100 0,88 0,12" … />
 *
 * `preserveAspectRatio="none"` is what lets a 0–100 viewBox stretch to any width/height, which is
 * exactly how percentage clip-paths behave. Without it every non-square shape would be letterboxed.
 */
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

interface PolyProps {
  /** Design percentages, `x,y` pairs separated by spaces. */
  readonly points: string;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Poly({ points, width, height, fill, style }: PolyProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" style={style}>
      <Polygon points={points} fill={fill} />
    </Svg>
  );
}
