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
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLayout } from '../theme/useLayout';
import { color } from '../theme/tokens';
import { Poly } from './Poly';

export function Splash() {
  const L = useLayout();
  const { width } = L;
  // The ship and the sea are art — they scale. The wordmark and the loader label are type.
  const px = L.a;
  const tx = L.t;

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

  // Hoisted OUT of the worklet on purpose. `useAnimatedStyle` runs on the UI runtime, which
  // cannot synchronously call a JS closure — and `px` is one. Calling it inside crashed the app
  // on its very first frame with "[Worklets] Tried to synchronously call a Remote Function".
  // react-native-web does not enforce worklet boundaries, so this was invisible until a device.
  const bobRise = px(5);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bobRise * bob.value }, { rotate: `${-1.2 + 2.4 * bob.value}deg` }],
  }));

  return (
    <View style={s.screen}>
      {/* sea */}
      <View style={[s.sea, { height: px(210), borderTopWidth: px(5) }]} />
      {/* the dashed swell — 26pt on, 26pt off */}
      <View style={[s.swell, { bottom: px(150), height: px(4) }]}>
        {Array.from({ length: Math.ceil(width / px(52)) + 1 }, (_, i) => (
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

      {/* wordmark */}
      <View style={[s.title, { top: px(150) }]}>
        <Text style={[s.kicker, { fontSize: tx(15), letterSpacing: tx(15) * 0.24 }]}>CANNON</Text>
        <Text style={[s.wordmark, { fontSize: tx(46), lineHeight: tx(46) }]}>ACADEMY</Text>
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

      {/* the ship, bobbing */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '50%',
            marginLeft: -px(78),
            bottom: px(196),
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

      {/* loader */}
      <View style={[s.loader, { bottom: px(64), gap: px(12) }]}>
        <View style={{ flexDirection: 'row', gap: px(8) }}>
          {[0, 180, 360].map((delay) => (
            <PulseDot key={delay} delay={delay} size={px(14)} />
          ))}
        </View>
        <Text style={[s.hoisting, { fontSize: tx(12), letterSpacing: tx(12) * 0.1 }]}>
          HOISTING THE SAILS
        </Text>
      </View>
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
  screen: { flex: 1, backgroundColor: '#0C5E86', overflow: 'hidden' },
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
  kicker: { fontFamily: 'Baloo2_800ExtraBold', color: color.gold },
  wordmark: { fontFamily: 'Baloo2_800ExtraBold', color: color.parchment },
  loader: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hoisting: { fontFamily: 'Nunito_800ExtraBold', color: color.chipInk },
});
