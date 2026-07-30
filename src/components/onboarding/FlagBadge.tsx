/**
 * A flag, drawn as the onboarding board draws it: a silhouette with a centre mark.
 *
 * The board's flag row is the only place in the whole flow where six things are offered at once,
 * and its reading audit is explicit about why they are not six colour swatches — *"six flags
 * differing by shape and mark, not colour alone. A tick lands on the chosen one."* Roughly one boy
 * in twelve cannot use hue as the primary channel, and the flag is not decoration: board 5b makes
 * it the ship's pennant, the mark a child recognises as **theirs** on a moving ship at ~26pt.
 *
 * Shape and mark come from `theme/flags.ts` so the pennant on the mast and the swatch on this
 * screen can never disagree, and so the set stays assertable headless.
 *
 * Everything is composed geometry — `Poly` and `View`, no raster. `sprites.test.ts` allows exactly
 * nine PNGs and none of them is a flag.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Poly } from '../Poly';
import type { FlagMark, FlagOption, FlagShape } from '../../theme/flags';

/**
 * The board's own `clip-path` percentages, transcribed in the same vertex order `Poly` takes.
 *
 * The swallowtail's notch is at 78% rather than the more obvious 50%: a deeper cut reads as two
 * separate pennants at swatch size, which is the opposite of a distinguishing mark.
 */
const SHAPE_POINTS: Readonly<Record<FlagShape, string | null>> = {
  swallowtail: '0,0 100,0 78,50 100,100 0,100',
  /** `null` means "a plain rectangle" — a Poly for four square corners is an SVG for nothing. */
  rectangular: null,
};

/**
 * Centre marks. `circle` is a rounded `View` rather than a polygon, because a polygon circle is
 * either faceted or forty vertices.
 */
const MARK_POINTS: Readonly<Record<FlagMark, string | null>> = {
  circle: null,
  triangle: '50,0 100,100 0,100',
  star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35',
  cross: '35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35',
  diamond: '50,0 100,50 50,100 0,50',
  chevron: '0,8 50,52 100,8 100,48 50,92 0,48',
};

/** The board's 64×44 flag with a 20×20 mark — a 0.3125 ratio, held at every size. */
const MARK_RATIO = 20 / 64;

export function FlagBadge({
  flag,
  width,
  style,
}: {
  readonly flag: FlagOption;
  /** Flag width in points. Height follows the board's 64:44 proportion. */
  readonly width: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const height = (width * 44) / 64;
  const markSize = Math.max(6, Math.round(width * MARK_RATIO));
  const shapePoints = SHAPE_POINTS[flag.shape];
  const markPoints = MARK_POINTS[flag.mark];

  return (
    <View style={[{ width, height }, style]}>
      {shapePoints === null ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: flag.color, borderRadius: 2 }]} />
      ) : (
        <Poly
          points={shapePoints}
          width={width}
          height={height}
          fill={flag.color}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Centred on the HOIST half, not on the flag's box: the swallowtail eats its trailing edge,
        so a mark centred on the box drifts into the notch and loses a third of itself. */}
      <View
        style={{
          position: 'absolute',
          left: width * (flag.shape === 'swallowtail' ? 0.39 : 0.5) - markSize / 2,
          top: height / 2 - markSize / 2,
          width: markSize,
          height: markSize,
        }}
      >
        {markPoints === null ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: flag.markColor, borderRadius: 999 },
            ]}
          />
        ) : (
          <Poly
            points={markPoints}
            width={markSize}
            height={markSize}
            fill={flag.markColor}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    </View>
  );
}
