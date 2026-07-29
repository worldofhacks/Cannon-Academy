/**
 * The temperament badge — a hexagon, a circle, or a twelve-point burst.
 *
 * These were circles in the first pass because React Native has no `clip-path` and a circle was
 * the nearest primitive. That substitution deleted the design's only colour-blind-safe
 * temperament cue: shape. `react-native-svg` renders the design's own polygon points exactly, so
 * the badge is now the shape the board specifies rather than the shape RN made easy.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';

import type { Temperament } from '@content/schemas';

import { temperLook } from '../../theme/cannonPresentation';
import { color, type } from '../../theme/tokens';

export function TemperBadge({ temper, size = 40 }: { temper: Temperament; size?: number }) {
  const look = temperLook[temper];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {look.points === null ? (
          <Circle cx={50} cy={50} r={50} fill={look.color} />
        ) : (
          <Polygon points={look.points} fill={look.color} />
        )}
      </Svg>
      <Text style={[t.glyph, { fontSize: size * 0.475 }]}>{look.glyph}</Text>
    </View>
  );
}

const t = StyleSheet.create({
  glyph: { ...type.title, color: color.white, includeFontPadding: false },
});
