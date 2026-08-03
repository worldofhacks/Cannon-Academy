/**
 * The storm wall ahead — the top 236pt of the Uncharted Sea's window (A-082 item 2).
 *
 * Three storm blobs tinted by the state, the ghost of the NEXT island's rival at the state's
 * own opacity, two bolts, and the ahead-label pill. On the victorious screen a fourth blob
 * drifts (`us-stir`) — the one ambient loop the ticket names ("wall stir on victorious"), so it
 * is the one this component animates. The other loops (`us-storm` wobbles, `us-ghost` drift,
 * `us-bolt` flicker) are recorded in `unchartedBoard.ts` as ranges and rendered at their
 * authored base — deferred ambience, same posture as the chart's first pass.
 *
 * The ghost renders at the STATE opacity (`aheadShip`) by ticket ruling; see the board-trap
 * note in `unchartedBoard.ts`.
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Blob } from '../chart/Blob';
import { Poly } from '../Poly';
import { color, font } from '../../theme/tokens';
import {
  contentTones,
  deepSea,
  SEA_GRADIENT,
  WALL,
  type UnchartedStateSpec,
} from './unchartedBoard';

/**
 * The full-bleed deep-sea backdrop — the board's radial gradient, drawn once behind the whole
 * sea box so the wall, the island and the tally all sit in the same water.
 */
export function DeepSeaBackdrop({ width, height }: { readonly width: number; readonly height: number }) {
  if (width <= 0 || height <= 0) return null;
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <RadialGradient
          id="uncharted-sea"
          cx={`${SEA_GRADIENT.cx}%`}
          cy={`${SEA_GRADIENT.cy}%`}
          rx={`${SEA_GRADIENT.rx}%`}
          ry={`${SEA_GRADIENT.ry}%`}
        >
          {SEA_GRADIENT.stops.map((stop) => (
            <Stop key={stop.color} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#uncharted-sea)" />
    </Svg>
  );
}

interface StormWallProps {
  readonly spec: UnchartedStateSpec;
  /** Uniform art scale — board px × art = screen pt. */
  readonly art: number;
  /** The sea box's real width; blob anchors ride its edges, the label centres on it. */
  readonly width: number;
}

export function StormWall({ spec, art, width }: StormWallProps) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height: WALL.height * art,
        overflow: 'hidden',
      }}
    >
      {WALL.blobs.map((blob, i) => (
        <Blob
          key={i}
          radii={blob.radii}
          width={blob.w * art}
          height={blob.h * art}
          fill={blob.fill === 'wallA' ? spec.wallA : spec.wallB}
          opacity={spec.wallOpacity}
          style={{
            position: 'absolute',
            top: blob.top * art,
            ...(blob.left !== undefined ? { left: blob.left * art } : {}),
            ...(blob.right !== undefined ? { right: blob.right * art } : {}),
          }}
        />
      ))}

      {spec.wallStirs ? <StirBlob art={art} fill={spec.wallB} /> : null}

      {/* The ghost ship ahead, at the state's own opacity (ticket item 2). */}
      <View
        style={{
          position: 'absolute',
          left: WALL.ghost.left * art,
          top: WALL.ghost.top * art,
          width: WALL.ghost.w * art,
          height: WALL.ghost.h * art,
          opacity: spec.aheadShip,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: WALL.ghost.mast.left * art,
            bottom: WALL.ghost.mast.bottom * art,
            width: WALL.ghost.mast.w * art,
            height: WALL.ghost.mast.h * art,
            backgroundColor: deepSea.deepInk,
          }}
        />
        <Poly
          points={WALL.ghost.sail.points}
          width={WALL.ghost.sail.w * art}
          height={WALL.ghost.sail.h * art}
          fill={deepSea.deepInk}
          style={{
            position: 'absolute',
            left: WALL.ghost.sail.left * art,
            bottom: WALL.ghost.sail.bottom * art,
          }}
        />
        <Poly
          points={WALL.ghost.hull.points}
          width={WALL.ghost.hull.w * art}
          height={WALL.ghost.hull.h * art}
          fill={deepSea.deepInk}
          style={{
            position: 'absolute',
            left: WALL.ghost.hull.left * art,
            bottom: WALL.ghost.hull.bottom * art,
          }}
        />
      </View>

      {WALL.bolts.map((bolt, i) => (
        <Poly
          key={i}
          points={WALL.boltPoints}
          width={bolt.w * art}
          height={bolt.h * art}
          fill={color.gold}
          style={{
            position: 'absolute',
            top: bolt.top * art,
            opacity: bolt.opacity,
            ...(bolt.left !== undefined ? { left: bolt.left * art } : {}),
            ...(bolt.right !== undefined ? { right: bolt.right * art } : {}),
          }}
        />
      ))}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: WALL.aheadPill.bottom * art, alignItems: 'center' }}>
        <View
          style={{
            paddingHorizontal: WALL.aheadPill.padX * art,
            paddingVertical: WALL.aheadPill.padY * art,
            borderRadius: 999,
            backgroundColor: deepSea.deepInk,
            opacity: WALL.aheadPill.groundOpacity,
          }}
        >
          <Text
            style={{
              fontFamily: font.bodyBold,
              fontSize: WALL.aheadPill.size * art,
              lineHeight: WALL.aheadPill.size * art * 1.3,
              letterSpacing: WALL.aheadPill.size * art * WALL.aheadPill.tracking,
              color: contentTones.labelCool,
            }}
          >
            {spec.aheadLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Hoisted for the worklet — a `useAnimatedStyle` body may read no JS closures (A-018). */
const STIR_DRIFT = WALL.stir.driftX;
const STIR_SCALE_SPAN = WALL.stir.scaleTo - 1;

/** The victorious drift: `us-stir` — the wall thinning and beginning to move (board note C). */
function StirBlob({ art, fill }: { readonly art: number; readonly fill: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: WALL.stir.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const drift = STIR_DRIFT * art;
  const stirStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift * pulse.value }, { scale: 1 + STIR_SCALE_SPAN * pulse.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: WALL.stir.left * art,
          top: WALL.stir.top * art,
          opacity: WALL.stir.opacity,
        },
        stirStyle,
      ]}
    >
      {/* `border-radius: 50%` on a 300×170 box is an ellipse, which is `Blob`'s all-50 corner set. */}
      <Blob radii={[50, 50, 50, 50]} width={WALL.stir.w * art} height={WALL.stir.h * art} fill={fill} />
    </Animated.View>
  );
}
