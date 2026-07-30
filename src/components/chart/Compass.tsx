/**
 * The compass rose — cream on the water, red north. **Scenery, and nothing else.**
 *
 * Board 9d gave it two jobs: *"It anchors the map as a chart rather than a level select, and it
 * doubles as the zoom-out button."* The second died with the close chart — there is one view now,
 * so there is nothing to zoom out to — and the owner's rule is explicit: a thing that looks tappable
 * and does nothing is the exact defect being fixed. There is no `Pressable` in this file, no
 * `accessibilityRole`, and `VoyageMap` draws it inside `pointerEvents="none"`.
 *
 * The first job survives untouched and needs no tap.
 *
 * `sc-spin` is declared in the board's stylesheet and never applied to this or anything else, so
 * the rose does not turn (owner ruling 11). A compass whose needle drifts is a broken compass.
 */
import { View } from 'react-native';

import { COMPASS } from './board';
import { art, type MapFrame } from './layout';
import { chart } from './palette';
import { Poly } from '../Poly';

/** The rose itself. Sized from the board's 58pt face. */
export function CompassRose({ frame }: { frame: MapFrame }) {
  const size = art(frame, COMPASS.size);
  const scale = size / COMPASS.size;
  const arms = [COMPASS.north, COMPASS.south, COMPASS.west, COMPASS.east];

  return (
    <View style={{ width: size, height: size, opacity: COMPASS.opacity }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: chart.compassFace,
          // `box-shadow: inset 0 0 0 3px #C9AE7E` — a spread-only inset, which is a border in RN.
          borderWidth: COMPASS.ringWidth * scale,
          borderColor: chart.compassRing,
        }}
      />
      {arms.map((arm) => (
        <Poly
          key={`${arm.x}-${arm.y}`}
          points={arm.points}
          width={arm.w * scale}
          height={arm.h * scale}
          fill={arm.fill}
          style={{ position: 'absolute', left: arm.x * scale, top: arm.y * scale }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: COMPASS.hub.x * scale,
          top: COMPASS.hub.y * scale,
          width: COMPASS.hub.size * scale,
          height: COMPASS.hub.size * scale,
          borderRadius: 999,
          backgroundColor: chart.compassHub,
        }}
      />
    </View>
  );
}
