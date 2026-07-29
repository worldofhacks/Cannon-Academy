/**
 * The captain, standing on your deck.
 *
 * Transcribed from `Cannon Academy Duel.dc.html`, not reinterpreted: every offset, size, radius
 * and keyframe below is the prototype's own number. He is 34×54 at the source scale with a
 * `transform-origin` of 50% 100%, and the whole figure is one wrapper transform plus one arm
 * rotation — which is exactly what makes five poses cost five tweens instead of five sprites.
 *
 * Board 6c explains why he exists at all: he is a SECOND FEEDBACK CHANNEL. Every outcome today is
 * reported by a banner a child has to read. He reports the same outcome by body language, which a
 * five-year-old parses before the words.
 *
 * Chibi proportions are deliberate (board 6b): the head is nearly half his height, the eyes sit
 * low and wide with a white glint each, and the limbs are stubs. The tricorn is three parts —
 * brim, two upturned tips, low crown — plus a gold band and a feather, because at 34px a single
 * hat shape reads as a beanie.
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

import { color } from '../../theme/tokens';

/** Which of the five poses is playing. Driven by the duel phase, never by the damage number. */
export type CaptainPose = 'idle' | 'aim' | 'cheer' | 'brace' | 'wince';

export interface CaptainLook {
  /** One of board 6b's four coat swatches. No free colour picker — see the board's note. */
  readonly coat: string;
  readonly skin: string;
  readonly hat: 'tricorn' | 'bandana';
}

export const DEFAULT_CAPTAIN: CaptainLook = {
  coat: color.captainCoat,
  skin: color.captainSkin,
  hat: 'tricorn',
};

interface CaptainProps {
  readonly look?: CaptainLook;
  readonly pose: CaptainPose;
  /** Scale factor applied to the 34×54 source figure. The prototype draws him at 1.0 on deck. */
  readonly scale?: number;
}

export function Captain({ look = DEFAULT_CAPTAIN, pose, scale = 1 }: CaptainProps) {
  const t = useSharedValue(0);
  const arm = useSharedValue(0);

  useEffect(() => {
    // Looping poses run forever; one-shot poses play once and hold. Restarting the shared value
    // on every pose change is what stops a cheer from inheriting the tail of an idle.
    t.value = 0;
    switch (pose) {
      case 'idle':
        t.value = withRepeat(loop(3200), -1, true);
        break;
      case 'aim':
        t.value = withRepeat(loop(2200), -1, true);
        break;
      case 'brace':
        t.value = withRepeat(loop(1400), -1, true);
        break;
      case 'cheer':
        t.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) });
        break;
      case 'wince':
        t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
        break;
    }
    // The arm only leaves his side to punch the air on a perfect shot.
    arm.value =
      pose === 'cheer'
        ? withSequence(
            withTiming(-128, { duration: 168, easing: Easing.out(Easing.quad) }),
            withTiming(-112, { duration: 252, easing: Easing.out(Easing.quad) }),
          )
        : withTiming(0, { duration: 160 });
  }, [pose, t, arm]);

  const body = useAnimatedStyle(() => {
    const v = t.value;
    switch (pose) {
      case 'aim':
        return { transform: [{ rotate: `${4 + 2 * v}deg` }, { translateX: 1 + v }] };
      case 'brace':
        return {
          transform: [{ translateY: 2 + 2 * v }, { scaleY: 0.94 - 0.04 * v }, { rotate: `${-4 - 2 * v}deg` }],
        };
      case 'cheer': {
        // 0 → 0.3 leap, 0.3 → 0.6 overshoot back, 0.6 → 1 settle. The prototype's three stops.
        const y = v < 0.3 ? -30 * v : v < 0.6 ? -9 + 7 * ((v - 0.3) / 0.3) : -2 + 2 * ((v - 0.6) / 0.4);
        const r = v < 0.3 ? -20 * v : v < 0.6 ? -6 + 10 * ((v - 0.3) / 0.3) : 4 - 4 * ((v - 0.6) / 0.4);
        return { transform: [{ translateY: y }, { rotate: `${r}deg` }] };
      }
      case 'wince': {
        const r = v < 0.25 ? -56 * v : v < 0.6 ? -14 + 22 * ((v - 0.25) / 0.35) : 8 - 8 * ((v - 0.6) / 0.4);
        const y = v < 0.25 ? 12 * v : 3 - 3 * ((v - 0.25) / 0.75);
        return { transform: [{ rotate: `${r}deg` }, { translateY: y }] };
      }
      default:
        return { transform: [{ rotate: `${-2 + 4 * v}deg` }, { translateY: -v }] };
    }
  });

  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arm.value}deg` }] }));

  const s = scale;
  const px = (n: number) => n * s;
  const { coat, skin, hat } = look;

  return (
    <Animated.View style={[{ width: px(34), height: px(54), transformOrigin: '50% 100%' }, body]}>
      {/* boots */}
      <View style={boot(px(8), px(6), px(8), s, color.gunport)} />
      <View style={boot(px(18), px(6), px(8), s, color.gunport)} />

      {/* torso + belt */}
      <View
        style={{
          position: 'absolute',
          left: px(6),
          bottom: px(5),
          width: px(22),
          height: px(15),
          borderTopLeftRadius: px(9),
          borderTopRightRadius: px(9),
          borderBottomLeftRadius: px(6),
          borderBottomRightRadius: px(6),
          backgroundColor: coat,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: px(3),
            height: px(4),
            backgroundColor: 'rgba(20,10,0,0.28)',
          }}
        />
      </View>

      {/* left arm — always at his side */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: px(10),
          width: px(6),
          height: px(9),
          borderRadius: px(3),
          backgroundColor: coat,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: px(8),
          width: px(5),
          height: px(5),
          borderRadius: 999,
          backgroundColor: skin,
        }}
      />

      {/* right arm — the one that punches the air */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: px(26),
            bottom: px(8),
            width: px(8),
            height: px(14),
            transformOrigin: '50% 12%',
          },
          armStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: px(1),
            top: 0,
            width: px(6),
            height: px(9),
            borderRadius: px(3),
            backgroundColor: coat,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: px(1),
            top: px(8),
            width: px(6),
            height: px(6),
            borderRadius: 999,
            backgroundColor: skin,
          }}
        />
      </Animated.View>

      {/* head */}
      <View
        style={{
          position: 'absolute',
          left: px(4),
          bottom: px(17),
          width: px(26),
          height: px(23),
          borderRadius: 999,
          backgroundColor: skin,
        }}
      >
        <Eye left={px(4)} top={px(8)} s={s} />
        <Eye left={px(15)} top={px(8)} s={s} />
        <Blush left={px(0)} top={px(15)} s={s} />
        <Blush left={px(20)} top={px(15)} s={s} />
        {/* mouth — a smile is the bottom half of a circle, not a stroke */}
        <View
          style={{
            position: 'absolute',
            left: px(10),
            top: px(17),
            width: px(6),
            height: px(3),
            borderBottomLeftRadius: 999,
            borderBottomRightRadius: 999,
            backgroundColor: color.inkDark,
          }}
        />
      </View>

      {hat === 'tricorn' ? <Tricorn coat={coat} s={s} /> : <Bandana s={s} />}
    </Animated.View>
  );
}

// ── Parts ────────────────────────────────────────────────────────────────────────────────────

function Tricorn({ coat, s }: { coat: string; s: number }) {
  const px = (n: number) => n * s;
  return (
    <>
      {/* low crown */}
      <View
        style={{
          position: 'absolute',
          left: px(8),
          bottom: px(41),
          width: px(18),
          height: px(11),
          borderTopLeftRadius: px(8),
          borderTopRightRadius: px(8),
          borderBottomLeftRadius: px(2),
          borderBottomRightRadius: px(2),
          backgroundColor: coat,
        }}
      />
      {/* two upturned tips — triangles, via the border trick (no clip-path in RN) */}
      <Triangle left={px(-1)} bottom={px(40)} width={px(11)} height={px(8)} color={coat} lean={0.58} />
      <Triangle left={px(24)} bottom={px(40)} width={px(11)} height={px(8)} color={coat} lean={0.42} />
      {/* brim */}
      <View
        style={{
          position: 'absolute',
          left: px(-1),
          bottom: px(36),
          width: px(36),
          height: px(9),
          borderRadius: 999,
          backgroundColor: coat,
        }}
      />
      {/* gold band */}
      <View
        style={{
          position: 'absolute',
          left: px(8),
          bottom: px(41),
          width: px(18),
          height: px(4),
          backgroundColor: color.amber,
        }}
      />
      {/* feather */}
      <View
        style={{
          position: 'absolute',
          left: px(22),
          bottom: px(48),
          width: px(14),
          height: px(5),
          borderRadius: 999,
          backgroundColor: color.parchment,
          transform: [{ rotate: '-26deg' }],
        }}
      />
    </>
  );
}

function Bandana({ s }: { s: number }) {
  const px = (n: number) => n * s;
  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: px(3),
          bottom: px(35),
          width: px(28),
          height: px(8),
          borderTopLeftRadius: px(9),
          borderTopRightRadius: px(9),
          borderBottomLeftRadius: px(3),
          borderBottomRightRadius: px(3),
          backgroundColor: '#D93A2E',
        }}
      >
        {[3, 12, 21].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute',
              left: px(x),
              top: px(2),
              width: px(4),
              height: px(4),
              borderRadius: 999,
              backgroundColor: color.parchment,
            }}
          />
        ))}
      </View>
      <View
        style={{
          position: 'absolute',
          left: px(-3),
          bottom: px(33),
          width: px(10),
          height: px(6),
          borderTopLeftRadius: 999,
          borderBottomLeftRadius: 999,
          backgroundColor: '#B02418',
          transform: [{ rotate: '16deg' }],
        }}
      />
    </>
  );
}

/** An upward triangle. `lean` is the apex position as a fraction of the width. */
function Triangle({
  left,
  bottom,
  width,
  height,
  color: fill,
  lean,
}: {
  left: number;
  bottom: number;
  width: number;
  height: number;
  color: string;
  lean: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left,
        bottom,
        width: 0,
        height: 0,
        borderBottomWidth: height,
        borderBottomColor: fill,
        borderLeftWidth: width * lean,
        borderRightWidth: width * (1 - lean),
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
      }}
    />
  );
}

function Eye({ left, top, s }: { left: number; top: number; s: number }) {
  const px = (n: number) => n * s;
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: px(7),
        height: px(7),
        borderRadius: 999,
        backgroundColor: color.inkDark,
      }}
    >
      {/* the glint. Without it the eyes read as holes rather than as looking at something. */}
      <View
        style={{
          position: 'absolute',
          left: px(1),
          top: px(1),
          width: px(3),
          height: px(3),
          borderRadius: 999,
          backgroundColor: color.white,
        }}
      />
    </View>
  );
}

function Blush({ left, top, s }: { left: number; top: number; s: number }) {
  const px = (n: number) => n * s;
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: px(6),
        height: px(4),
        borderRadius: 999,
        backgroundColor: 'rgba(217,58,46,0.3)',
      }}
    />
  );
}

function boot(left: number, height: number, width: number, s: number, fill: string) {
  return {
    position: 'absolute' as const,
    left,
    bottom: 0,
    width,
    height,
    borderTopLeftRadius: 3 * s,
    borderTopRightRadius: 3 * s,
    borderBottomLeftRadius: 5 * s,
    borderBottomRightRadius: 5 * s,
    backgroundColor: fill,
  };
}

function loop(durationMs: number) {
  return withSequence(
    withTiming(1, { duration: durationMs / 2, easing: Easing.inOut(Easing.quad) }),
    withTiming(0, { duration: durationMs / 2, easing: Easing.inOut(Easing.quad) }),
  );
}

/** The duel phase a pose belongs to. Kept here so the screen never invents a sixth pose. */
export function captainPoseForPhase(phase: string, perfect: boolean): CaptainPose {
  if (phase === 'perfect' || (phase === 'impact' && perfect)) return 'cheer';
  if (phase === 'question') return 'aim';
  if (phase === 'miss' || phase === 'rivalImpact') return 'wince';
  if (phase === 'watch' || phase === 'rivalFly') return 'brace';
  return 'idle';
}
