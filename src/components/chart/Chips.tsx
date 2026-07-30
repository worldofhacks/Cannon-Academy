/**
 * The two floating chips the board pins to the water itself rather than to a node.
 *
 * Both are white on `rgba(12,94,134,.8)` — sea-deep at 80% over the gradient, which is the readable
 * blue (7.09 at full strength) rather than the `sea` that white may never sit on (4.18, one of the
 * four banned pairs in A-054). The board picked the right one; this note is so a later tidy does
 * not "simplify" it to `sea`.
 */
import { Text, View } from 'react-native';

import { VOYAGE, CLOSE_NODE } from './board';
import { chromeInsetX, chromeY, type BoardSlack, type MapFrame } from './layout';
import { chart } from './palette';
import { font } from '../../theme/tokens';

/** `THE WHOLE SEA · N OF 16 FOUND`, top left of the voyage map. */
export function Counter({
  frame,
  slack,
  typeScale,
  text,
}: {
  frame: MapFrame;
  slack: BoardSlack;
  typeScale: number;
  text: string;
}) {
  const size = VOYAGE.counter.size * typeScale;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: chromeInsetX(frame, VOYAGE.counter.x, slack),
        top: chromeY(frame, VOYAGE.counter.y, slack),
        paddingHorizontal: VOYAGE.counter.padX * typeScale,
        paddingVertical: VOYAGE.counter.padY * typeScale,
        borderRadius: 999,
        backgroundColor: chart.waterChip,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.bodyBold,
          fontSize: size,
          lineHeight: size * 1.3,
          letterSpacing: size * VOYAGE.counter.tracking,
          color: chart.white,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** `PRACTICE BUOY` — the close chart's one waypoint label. */
export function WaterChip({ text, typeScale }: { text: string; typeScale: number }) {
  const spec = CLOSE_NODE.smallChip;
  const size = spec.size * typeScale;

  return (
    <View
      style={{
        paddingHorizontal: spec.padX * typeScale,
        paddingVertical: spec.padY * typeScale,
        borderRadius: 999,
        backgroundColor: chart.waterChipFirm,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.bodyBold,
          fontSize: size,
          lineHeight: size * 1.3,
          letterSpacing: size * spec.tracking,
          color: chart.white,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
