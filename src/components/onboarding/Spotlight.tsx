/**
 * The gold ring and the pointing hand — the board's only way of saying "this one".
 *
 * Board rule ONE THING: *"Every beat that asks for a tap has exactly one gold ring on the screen,
 * and a pointing hand beside it. A child never has to choose what the instruction refers to,
 * because only one thing is glowing."* The ring is what carries the instruction for a child who
 * cannot read the coach line, so it is not decoration and it is not subtle.
 *
 * Drawn as a ring rather than a scrim-with-a-hole. The board's `worldScrim` is hardcoded `false`
 * and is not implemented here either: on the real chart a dark wash would hide the sea the beat is
 * introducing, and the ring is legible on every ground the flow puts it on.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Poly } from '../Poly';
import { color } from '../../theme/tokens';

export interface SpotlightRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Board: `box-shadow: 0 0 0 4px #FFD23F` sitting 4pt outside the target, radius 22. */
const RING_WIDTH = 4;
const RING_INSET = 4;

/** The board's `ob-hand` disc. Named because the hand is anchored off its own height. */
const HAND_SIZE = 30;

export function Spotlight({
  rect,
  /** Board `border-radius:22px` on the stage ring, `999` where it wraps a pill. */
  cornerRadius = 22,
  /** The board pairs a ring with a bobbing hand on beats that ask for a tap. */
  hand = false,
}: {
  readonly rect: SpotlightRect;
  readonly cornerRadius?: number;
  readonly hand?: boolean;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <View
        style={{
          position: 'absolute',
          left: rect.x - RING_INSET,
          top: rect.y - RING_INSET,
          width: rect.width + RING_INSET * 2,
          height: rect.height + RING_INSET * 2,
          borderRadius: cornerRadius,
          borderWidth: RING_WIDTH,
          borderColor: color.gold,
        }}
      />
      {/*
        Top-right, and the triangle is why.

        `PointingHand` carries a DOWNWARD triangle, so it only reads as pointing when it sits above
        what it names. Anchored below the ring it pointed away from the control — at the dock, where
        the ring is already at the bottom of the screen, it aimed the hand off the frame entirely.

        It also bobs 9pt downward on its loop, which is a nudge toward the target from above and a
        retreat from it below. The gesture and the geometry have to agree.
      */}
      {hand ? (
        <PointingHand
          left={rect.x + rect.width - 8}
          top={rect.y - RING_INSET - HAND_SIZE + 4}
        />
      ) : null}
    </View>
  );
}

/**
 * The board's `ob-hand` keyframe: a 30pt gold disc with a downward triangle, bobbing 9pt on a
 * 1.1s ease-in-out loop. The bob is the part that matters — a static hand reads as an icon, and a
 * moving one reads as an instruction.
 */
function PointingHand({ left, top }: { readonly left: number; readonly top: number }) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: 9 * bob.value }] }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: HAND_SIZE,
          height: HAND_SIZE,
          borderRadius: 999,
          backgroundColor: color.gold,
          borderBottomWidth: 3,
          borderBottomColor: color.goldDeep,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animated,
      ]}
    >
      <Poly points="50,100 0,0 100,0" width={11} height={11} fill={color.inkDark} />
    </Animated.View>
  );
}
