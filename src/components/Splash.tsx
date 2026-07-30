/**
 * Board 4a — the hydration splash, "the true first frame".
 *
 * Transcribed from the board's computed styles, not eyeballed: every offset, size and colour below
 * is the number the design resolves to at 375×667.
 *
 * It exists because the alternative is a blank frame. `useFonts` is async and AsyncStorage
 * rehydration will be too, so there is always a gap between launch and first paint — and
 * ARCHITECTURE.md §8 requires the root layout to hold until `hasHydrated` anyway. That hold is
 * either a white rectangle or it is this.
 *
 * Desktop/tablet: full-bleed sea and sky. Art scales from a soft design width so the scene grows
 * with the viewport without becoming a phone-width pillar floating in a void.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { computeLayout, viewportClassForWidth } from '../theme/responsive';
import { useLayout } from '../theme/useLayout';
import { color } from '../theme/tokens';
import { Poly } from './Poly';

/** Soft design width for splash art — grows on large screens, never phone-pillars the scene. */
const SPLASH_DESIGN_WIDTH = {
  compact: 430,
  tablet: 640,
  desktop: 820,
} as const;

export function Splash({
  ready,
  fontsLoaded = true,
  onStart,
}: {
  ready: boolean;
  /** When false, skip custom faces so web does not paint invisible zero-metric text. */
  fontsLoaded?: boolean;
  onStart: () => void;
}) {
  const window = useLayout();
  const viewport = viewportClassForWidth(window.width);
  const designWidth = Math.min(window.width, SPLASH_DESIGN_WIDTH[viewport]);
  const L = computeLayout(designWidth, window.height);
  // Type stays clamped; splash art may grow with the soft design width so desktop is present
  // without magnifying body copy.
  const artScale = Math.min(
    designWidth / 375,
    viewport === 'desktop' ? 1.55 : viewport === 'tablet' ? 1.4 : L.art,
  );
  const px = (n: number) => n * artScale;
  const tx = L.t;
  const displayFace = fontsLoaded ? 'Baloo2_800ExtraBold' : undefined;
  const bodyFace = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const swellCount = Math.ceil(window.width / Math.max(px(52), 1)) + 2;
  const seaHeight = Math.max(px(210), Math.round(window.height * 0.32));

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);

  const bobRise = px(5);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bobRise * bob.value }, { rotate: `${-1.2 + 2.4 * bob.value}deg` }],
  }));

  const scenery = (
    <>
      <View style={[s.sea, { height: seaHeight, borderTopWidth: px(5) }]} />
      <View style={[s.swell, { bottom: seaHeight - px(60), height: px(4) }]}>
        {Array.from({ length: swellCount }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: i * px(52),
              width: px(26),
              top: 0,
              bottom: 0,
              backgroundColor: color.seaFoam,
            }}
          />
        ))}
      </View>

      <View
        style={[
          s.title,
          {
            top: L.isShort ? px(96) : Math.max(px(120), Math.round(window.height * 0.14)),
            paddingHorizontal: px(16),
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            s.kicker,
            {
              fontFamily: displayFace,
              fontSize: tx(15),
              lineHeight: tx(22),
              letterSpacing: tx(15) * 0.18,
            },
          ]}
        >
          CANNON
        </Text>
        <Text
          numberOfLines={1}
          style={[
            s.wordmark,
            {
              fontFamily: displayFace,
              fontSize: tx(46),
              lineHeight: tx(58),
              paddingVertical: tx(2),
            },
          ]}
        >
          ACADEMY
        </Text>
        <View
          style={{
            width: px(120),
            height: px(4),
            borderRadius: px(2),
            backgroundColor: color.amber,
            marginTop: px(4),
          }}
        />
      </View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '50%',
            marginLeft: -px(78),
            bottom: seaHeight - px(14),
            width: px(156),
            height: px(118),
            transformOrigin: '50% 90%',
          },
          bobStyle,
        ]}
      >
        <Poly
          points="0,0 100,0 72,50 100,100 0,100"
          width={px(22)}
          height={px(15)}
          fill={color.amber}
          style={{ position: 'absolute', left: px(70), bottom: px(104) }}
        />
        <View
          style={{
            position: 'absolute',
            left: px(70),
            bottom: px(40),
            width: px(7),
            height: px(66),
            borderRadius: px(4),
            backgroundColor: color.wood,
          }}
        />
        <Poly
          points="100,0 100,100 0,88 0,12"
          width={px(44)}
          height={px(26)}
          fill={color.parchment}
          style={{ position: 'absolute', left: px(26), bottom: px(80) }}
        />
        <Poly
          points="100,0 100,100 0,90 0,10"
          width={px(52)}
          height={px(34)}
          fill={color.white}
          style={{ position: 'absolute', left: px(18), bottom: px(46) }}
        />
        <View
          style={{
            position: 'absolute',
            left: px(10),
            bottom: px(36),
            width: px(132),
            height: px(8),
            borderRadius: px(4),
            backgroundColor: color.deck,
          }}
        />
        <Poly
          points="0,0 100,0 88,100 10,100"
          width={px(156)}
          height={px(38)}
          fill={color.woodLight}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        />
        <Poly
          points="0,0 100,0 88,100 10,100"
          width={px(156)}
          height={px(12)}
          fill={color.woodDeep}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        />
      </Animated.View>
    </>
  );

  if (!ready) {
    return (
      <View style={s.screen}>
        {scenery}
        <View style={[s.footer, { bottom: px(64), gap: px(12) }]}>
          <View style={{ flexDirection: 'row', gap: px(8) }}>
            {[0, 180, 360].map((delay) => (
              <PulseDot key={delay} delay={delay} size={px(14)} />
            ))}
          </View>
          <Text
            style={[
              s.hoisting,
              {
                fontFamily: bodyFace,
                fontSize: tx(12),
                lineHeight: tx(16),
                letterSpacing: tx(12) * 0.08,
              },
            ]}
          >
            HOISTING THE SAILS
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {scenery}
      <View style={[s.footer, { bottom: px(44) }]}>
        {/*
          Beat 1 of the onboarding board, and the board is explicit about what it is for: *"One
          216×88 button with a pulsing ring. The whole first screen is a tap lesson disguised as a
          title card."* Its reading audit is equally explicit that *"the word is decoration"* — a
          waving ring, a crosshair and a quarter of the screen are what carry it.

          Which is why the ring and the geometry are adopted and the board's "Start" is not. The
          label stays SET SAIL: `launch-picker.test` `spec(A-042:AC-2)` binds the accessible name to
          that exact string, and shipping a button whose visible word disagrees with what a screen
          reader announces is an accessibility defect, not a copy change.
        */}
        <View style={{ width: px(216), height: px(88) }}>
          <PulseRing width={px(216)} height={px(88)} radius={px(22)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="SET SAIL"
            onPress={onStart}
            style={({ pressed }) => [
              s.start,
              {
                width: px(216),
                minHeight: Math.max(px(88), 64),
                borderRadius: px(22),
                borderBottomWidth: px(6),
                gap: px(4),
              },
              pressed && s.startPressed,
            ]}
          >
            <Crosshair size={px(34)} />
            <Text style={[s.startLabel, { fontFamily: displayFace, fontSize: tx(22), lineHeight: tx(28) }]}>
              {['SET', 'SAIL'].join(' ')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * The board's `ob-ring`: a copy of the button that scales from 0.86 to 1.6 and fades out, on a
 * 1.8s loop. It sits BEHIND the button and is `pointerEvents="none"`, so the one tap target on the
 * screen stays one tap target — `spec(A-042:AC-2)` counts `Pressable`s and it must find exactly one.
 */
function PulseRing({ width, height, radius }: { width: number; height: number; radius: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 0.86 + 0.74 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, top: 0, width, height, borderRadius: radius, backgroundColor: color.amber },
        animated,
      ]}
    />
  );
}

/**
 * The board's target reticle — a ring, four ticks and a centre dot. It is the picture of "tap
 * here", and it is the half of this button a pre-reader can actually use.
 */
function Crosshair({ size }: { size: number }) {
  const u = size / 34;
  const tick = {
    position: 'absolute' as const,
    borderRadius: 2 * u,
    backgroundColor: color.inkDark,
  };
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: 5 * u,
          borderColor: color.inkDark,
        }}
      />
      <View style={[tick, { left: 15 * u, top: -3 * u, width: 4 * u, height: 9 * u }]} />
      <View style={[tick, { left: 15 * u, top: 28 * u, width: 4 * u, height: 9 * u }]} />
      <View style={[tick, { left: -3 * u, top: 15 * u, width: 9 * u, height: 4 * u }]} />
      <View style={[tick, { left: 28 * u, top: 15 * u, width: 9 * u, height: 4 * u }]} />
      <View
        style={{
          position: 'absolute',
          left: 12 * u,
          top: 12 * u,
          width: 10 * u,
          height: 10 * u,
          borderRadius: 999,
          backgroundColor: color.inkDark,
        }}
      />
    </View>
  );
}

function PulseDot({ delay, size }: { delay: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [t, delay]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.14 * t.value }] }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: 999, backgroundColor: color.gold }, animated]}
    />
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0C5E86',
    overflow: 'hidden',
  },
  sea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sea,
    borderTopColor: color.seaFoam,
  },
  swell: { position: 'absolute', left: 0, right: 0, opacity: 0.6, overflow: 'hidden' },
  title: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  kicker: { color: color.gold, textAlign: 'center' },
  wordmark: { color: color.parchment, textAlign: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hoisting: { color: color.chipInk, textAlign: 'center' },
  /** Board: 216×88, radius 22, `0 6px 0 #B87309`. The bottom edge IS the affordance. */
  start: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.amber,
    borderBottomColor: color.goldDeep,
  },
  startPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
  startLabel: { color: color.inkDark },
});
