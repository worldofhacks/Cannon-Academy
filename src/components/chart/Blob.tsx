/**
 * A blob — the board's islands and fog banks, drawn as four elliptical corners.
 *
 * The board's land is `border-radius: 52% 40% 58% 44%`. That is not a rounded rectangle: each
 * corner is a quarter ELLIPSE whose two radii are percentages of the box, so a 126×88 island
 * curves 65.5pt across its top-left and 45.8pt down it. React Native's `borderRadius` is absolute
 * points with one radius per corner, so the nearest it can reach is a rounded rectangle — and a
 * rounded rectangle reads as a card, not as land. This is exactly the gap `Poly` was written for,
 * one shape family further on, and it is the difference between "an island" and "a tile".
 *
 * The path is authored in a 0–100 viewBox with `preserveAspectRatio="none"`, the same trick `Poly`
 * uses: the viewBox stretch is what turns "52% of the box" into "52% of the width across and 52%
 * of the height down", which is precisely CSS's rule for a percentage corner radius. One path
 * string therefore serves every size — the shape is scale-free, only the `<Svg>` box changes.
 *
 * `shadow` draws that same path again underneath, offset straight down. The board's islands cast a
 * HARD shadow (`box-shadow: 0 4px 0 …`), never a blur; that flat offset is the whole idiom of this
 * art, and a blur would read as a different game.
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { CornerPercents } from './board';

/** Percentage space. `preserveAspectRatio="none"` stretches it to whatever box is asked for. */
const VIEW_BOX = '0 0 100 100';

/**
 * CSS shrinks EVERY radius by one common factor when the two on any one edge would overlap
 * (CSS Backgrounds §5.5). The board's own island is `52 40 58 44`, which sums to 102% along the
 * bottom edge — so the browser drew it at 0.98 of the stated radii. Skipping this step draws
 * corners the board does not have, and the error is worst on exactly the shapes that need to read
 * as organic.
 */
const edgeFactor = (p: number, q: number): number => (p + q <= 0 ? 1 : 100 / (p + q));

const trim = (v: number): number => Math.round(v * 1000) / 1000;

/** The four-arc outline for a corner set, in the 0–100 percentage space. */
export function blobPath(radii: CornerPercents): string {
  const [tl, tr, br, bl] = radii;
  const f = Math.min(1, edgeFactor(tl, tr), edgeFactor(tr, br), edgeFactor(br, bl), edgeFactor(bl, tl));
  const a = trim(tl * f);
  const b = trim(tr * f);
  const c = trim(br * f);
  const d = trim(bl * f);

  return [
    `M ${a} 0`,
    `H ${trim(100 - b)}`,
    `A ${b} ${b} 0 0 1 100 ${b}`,
    `V ${trim(100 - c)}`,
    `A ${c} ${c} 0 0 1 ${trim(100 - c)} 100`,
    `H ${d}`,
    `A ${d} ${d} 0 0 1 0 ${trim(100 - d)}`,
    `V ${a}`,
    `A ${a} ${a} 0 0 1 ${a} 0`,
    'Z',
  ].join(' ');
}

interface BlobProps {
  /** The design's `border-radius: a% b% c% d%`, in TL, TR, BR, BL order. */
  readonly radii: CornerPercents;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  /** The board's hard offset shadow — the same shape again, `dy` points lower. Never a blur. */
  readonly shadow?: { readonly color: string; readonly dy: number };
  readonly style?: StyleProp<ViewStyle>;
  /** Drawn ON the blob — foliage, a hut. Position them absolutely against the blob's own box. */
  readonly children?: ReactNode;
}

export function Blob({ radii, width, height, fill, shadow, style, children }: BlobProps) {
  const d = blobPath(radii);

  return (
    <View style={[{ width, height }, style]}>
      {shadow === undefined ? null : (
        <Svg
          width={width}
          height={height}
          viewBox={VIEW_BOX}
          preserveAspectRatio="none"
          style={{ position: 'absolute', left: 0, top: shadow.dy }}
        >
          <Path d={d} fill={shadow.color} />
        </Svg>
      )}
      <Svg
        width={width}
        height={height}
        viewBox={VIEW_BOX}
        preserveAspectRatio="none"
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <Path d={d} fill={fill} />
      </Svg>
      {children}
    </View>
  );
}
