/**
 * A blob — the board's islands, shallows and fog banks, drawn as four elliptical corners.
 *
 * The board's land is `border-radius: 56% 44% 50% 50%`. That is not a rounded rectangle: each
 * corner is a quarter ELLIPSE whose two radii are percentages of the box, so a 220×150 island
 * curves 123pt across its top-left and 84pt down it. React Native's `borderRadius` is absolute
 * points with one radius per corner, so the nearest it can reach is a rounded rectangle — and a
 * rounded rectangle reads as a card, not as land. This is exactly the gap `Poly` was written for,
 * one shape family further on, and it is the difference between "an island" and "a tile".
 *
 * The path is authored in a 0–100 viewBox with `preserveAspectRatio="none"`, the same trick `Poly`
 * uses: the viewBox stretch is what turns "56% of the box" into "56% of the width across and 56% of
 * the height down", which is precisely CSS's rule for a percentage corner radius. One path string
 * therefore serves every size — the shape is scale-free, only the `<Svg>` box changes.
 *
 * Two shadows, and they are different things:
 *
 *   `shadow`      the board's OUTER hard shadow (`box-shadow: 0 4px 0 …`) — the same path again,
 *                 offset straight down. Never a blur; the flat offset is the whole idiom of this
 *                 art, and a blur would read as a different game.
 *   `innerShadow` the board's `box-shadow: inset 0 -8px 0 …`, which every island wears along its
 *                 bottom edge and which is what makes sand read as a beach rather than a shape. An
 *                 inset shadow offset UP by 8 leaves the bottom 8pt of the box uncovered, so it is
 *                 drawn as the deep colour under a copy of the fill clipped to the silhouette and
 *                 lifted by that much. Faking it with an outer shadow would grow the island by 8pt
 *                 and change the outline, which is the one thing that must not move.
 */
import { useId, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';

import type { CornerPercents } from './board';

/** Percentage space. `preserveAspectRatio="none"` stretches it to whatever box is asked for. */
const VIEW_BOX = '0 0 100 100';

/**
 * CSS shrinks EVERY radius by one common factor when the two on any one edge would overlap
 * (CSS Backgrounds §5.5). Skipping this step draws corners the board does not have, and the error
 * is worst on exactly the shapes that need to read as organic.
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
  /** The board's hard OUTER shadow — the same shape again, `dy` points lower. Never a blur. */
  readonly shadow?: { readonly color: string; readonly dy: number } | undefined;
  /** The board's `box-shadow: inset 0 -dy 0 color` — a band of `color` along the bottom inside. */
  readonly innerShadow?: { readonly color: string; readonly dy: number } | undefined;
  readonly opacity?: number | undefined;
  readonly style?: StyleProp<ViewStyle>;
  /** Drawn ON the blob — foliage, a hut, a palm. Position them against the blob's own box. */
  readonly children?: ReactNode;
}

export function Blob({
  radii,
  width,
  height,
  fill,
  shadow,
  innerShadow,
  opacity,
  style,
  children,
}: BlobProps) {
  // `useId` gives every blob on screen its own clip id. On web the SVG ids share one document, so
  // two islands with the same corner set would otherwise clip through each other's definition.
  const clipId = `blob-${useId().replace(/:/g, '')}`;
  const d = blobPath(radii);
  // The inset shadow's offset, converted into the 0–100 viewBox. `preserveAspectRatio="none"`
  // scales y by `height / 100`, so `-(dy / height) × 100` user units lands on exactly `-dy` pixels.
  const lift = innerShadow === undefined || height <= 0 ? 0 : (innerShadow.dy / height) * 100;

  return (
    <View style={[{ width, height, opacity }, style]}>
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
        {innerShadow === undefined ? (
          <Path d={d} fill={fill} />
        ) : (
          <>
            <Defs>
              <ClipPath id={clipId}>
                <Path d={d} />
              </ClipPath>
            </Defs>
            <Path d={d} fill={innerShadow.color} />
            <G clipPath={`url(#${clipId})`}>
              <Path d={d} fill={fill} transform={`translate(0 ${-lift})`} />
            </G>
          </>
        )}
      </Svg>
      {children}
    </View>
  );
}
